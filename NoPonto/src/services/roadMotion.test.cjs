/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const source=fs.readFileSync(path.join(__dirname,'../components/mapOSM/webview/mapScript.ts'),'utf8');
 const extract=name=>{const m=source.match(new RegExp('function '+name+'\\([^]*?\\n}'));assert.ok(m,name);return m[0];};
 const base=Date.parse('2026-11-15T12:00:00Z');let now=base,tick;const frames=new Map();let frameId=0;
 const c={Date:{now:()=>now},performance:{now:()=>now},drState:{},vehicleMarkers:{},vehiclePopups:{},vehicleHeadings:{},animFrames:{},window:{},motionTraceOrders:[],gpsPolicy:{baseProjectionMs:60000,maxProjectionMetres:250,delayedMs:180000,publicMs:480000},roadMovement:{accepted:0,repeated:0,routeSyncs:0,linearSyncs:0,positionWrites:0},drInterval:null,movementDiagnostics:false,roadMotionHorizonMs:60000,parseNum:x=>x==null?null:Number(x),distanceMeters:(a,b)=>Math.hypot(a.lat-b.lat,a.lng-b.lng)*111000,interpolarNaRota:(coords,p)=>[0,p],headingNaRota:()=>90,setHeading:()=>{},reportRoadMovement:()=>{},setInterval:f=>{tick=f;return 1;},gpsMarkerOpacity:()=>1,requestAnimationFrame:f=>{frames.set(++frameId,f);return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.createContext(c);vm.runInContext(['roadIdentityChanged','updateRoadHeading','updateRoadMotion','comprimentoRotaGraus','kmhParaGrausPorSeg','startDR','stopAnim','animateTo'].map(extract).join('\n'),c);
 const marker={pos:{lng:0,lat:0},setLngLat(p){this.pos={lng:p[0],lat:p[1]};},getLngLat(){return this.pos;},getElement(){return {style:{}};},remove(){}};
 const p={backendUnified:true,backendValidUntil:base+480000,backendMotionEligible:true,projectionUntil:base+60000,projectionMaxMetres:250,comprimentoRotaMetros:111000,projectionSpeedKmh:6,latitude:0,longitude:0};
 const update=(over={},coords=[[0,0],[0,1]],timestamp=base,position=0,identity='line|direction|pattern|version')=>c.updateRoadMotion('bus',marker,{...p,...over},coords,timestamp,position,identity);
 const advance=ms=>{const until=now+ms;while(now<until){now+=100;tick?.();}};
 c.startDR();return{c,p,base,marker,update,advance,frames};
}
test('late geometry uses the original fix and preserves deadline and projected budget',()=>{
 const f=fixture();f.update({backendMotionEligible:false},null,f.base,null);f.advance(30000);f.update();
 assert.ok(f.c.drState.bus.lineCoords);assert.equal(f.c.drState.bus.gpsTimestamp,f.base);assert.equal(f.c.drState.bus.projectionUntil,f.base+60000);
 f.advance(10000);assert.ok(f.c.drState.bus.projectedMetres>0);const used=f.c.drState.bus.projectedMetres;
 f.update({projectionUntil:f.base+90000,projectionMaxMetres:500});assert.equal(f.c.drState.bus.projectedMetres,used);assert.equal(f.c.drState.bus.projectionUntil,f.base+60000);assert.equal(f.c.drState.bus.projectionMaxMetres,250);
 f.advance(30000);const frozen=f.marker.pos.lng;f.update();f.advance(30000);assert.equal(f.marker.pos.lng,frozen);
});
test('same GPS eligibility withdrawal cancels RAF and rejects regressive or conflicting fixes',()=>{
 const f=fixture();f.update();f.update({longitude:.001},undefined,f.base+1000,.001);assert.ok(f.c.animFrames.bus);
 f.update({longitude:.001,backendMotionEligible:false},undefined,f.base+1000,.001);assert.equal(f.c.animFrames.bus,undefined);assert.equal(f.frames.size,0);
 f.update({longitude:.001,backendMotionEligible:true},undefined,f.base,0);assert.equal(f.c.drState.bus.backendMotionEligible,false);
 f.update({longitude:.5},undefined,f.base+1000,.5);assert.equal(f.c.drState.bus.backendMotionEligible,false);assert.equal(f.c.drState.bus.gpsCoordinate.lng,.001);
});
test('ambiguous context cannot start motion and fresh GPS still advances normally',()=>{
 const f=fixture();f.update({backendMotionEligible:false},null,f.base,null);f.update({backendMotionEligible:false},[[0,0],[0,1]],f.base,0);f.advance(10000);assert.equal(f.marker.pos.lng,0);
 f.update({},undefined,f.base+10000,.001);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);assert.ok(f.c.animFrames.bus);
});
test('same GPS route refresh preserves consumed distance and eligibility can resume before expiry',()=>{
 const f=fixture();f.update();f.advance(10000);const used=f.c.drState.bus.projectedMetres;f.update({backendMotionEligible:false});f.advance(10000);f.update();assert.equal(f.c.drState.bus.projectedMetres,used);f.advance(1000);assert.ok(f.c.drState.bus.projectedMetres>used);
 const old=f.c.drState.bus.posicaoNaRota;f.update({},[[0,0],[0,.5],[0,1]]);assert.ok(Math.abs(f.c.drState.bus.posicaoNaRota-old)<1e-12);assert.equal(f.c.drState.bus.gpsTimestamp,f.base);
});

test('legacy to unified handoff cannot reset an untracked projection budget',()=>{
 const f=fixture();f.update({backendUnified:false});f.advance(10000);f.update();
 const physical=f.c.drState.bus.gpsTimestamp;assert.equal(physical,f.base);assert.equal(f.c.drState.bus.backendMotionEligible,false);
 f.update();const current=f.marker.pos.lng;f.advance(1000);assert.equal(f.marker.pos.lng,current);
 f.update({},undefined,f.base+11000,.001);assert.equal(f.c.drState.bus.projectedMetres,0);
});

test('changed route length cannot reinterpret the old fraction as newly travelled distance',()=>{
 const f=fixture();f.update({},undefined,f.base,.8);f.advance(1000);const used=f.c.drState.bus.projectedMetres;
 f.update({comprimentoRotaMetros:222000},[[0,0],[0,2]],f.base,.4);
 assert.equal(f.c.drState.bus.projectedMetres,used);assert.equal(f.c.drState.bus.posicaoNaRota,.4+used/222000);
 assert.equal(f.c.drState.bus.gpsCoordinate.lng,0);assert.equal(f.c.drState.bus.gpsTimestamp,f.base);
});

test('projection cutoff does not cancel interpolation toward a genuinely new physical fix',()=>{
 const f=fixture();f.update({backendMotionEligible:false},null,f.base,null);f.advance(1000);
 f.update({backendMotionEligible:false,longitude:.0001},null,f.base+1000,null);
 assert.ok(f.c.animFrames.bus);f.advance(100);
 assert.ok(f.c.animFrames.bus);f.update({backendMotionEligible:false,longitude:.0001},null,f.base+1000,null);assert.ok(f.c.animFrames.bus);
 const frame=[...f.frames.values()].at(-1);frame(f.base+2700);
 assert.equal(f.marker.pos.lng,.0001);assert.equal(f.c.animFrames.bus,undefined);
});


test('new physical fix behind projection holds bounded debt without backwards RAF',()=>{
 const f=fixture();f.update();f.advance(10000);const visual=f.c.drState.bus.posicaoNaRota;
 f.update({longitude:.00005},undefined,f.base+10000,.00005);
 assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);assert.equal(f.c.drState.bus.gpsCoordinate.lng,.00005);
 assert.equal(f.c.drState.bus.posicaoNaRota,visual);assert.equal(f.c.animFrames.bus,undefined);
 assert.ok(f.c.drState.bus.projectedMetres>0);f.advance(10000);assert.equal(f.c.drState.bus.posicaoNaRota,visual);
 f.update({longitude:.0001},undefined,f.base+20000,.0001);f.advance(21000);
 assert.equal(f.c.drState.bus.visualAhead,false);assert.equal(f.c.drState.bus.posicaoNaRota,.0001);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+20000);
 f.update({longitude:.00011},undefined,f.base+41000,.00011);assert.equal(f.c.drState.bus.posicaoNaRota,.00011);
});
test('large backwards discrepancy or changed directed route corrects without reverse animation',()=>{
 const f=fixture();f.update({},undefined,f.base,.01);f.update({longitude:0},undefined,f.base+1000,0);
 assert.equal(f.c.animFrames.bus,undefined);assert.equal(f.c.drState.bus.posicaoNaRota,0);
 f.update({longitude:.002},undefined,f.base+2000,.002,'line|return|pattern2|version');
 assert.equal(f.c.animFrames.bus,undefined);assert.equal(f.c.drState.bus.identity,'line|return|pattern2|version');
});

test('projection fades across sixty seconds and approaches spatial cap without a hard cut',()=>{
 const f=fixture();f.update({projectionUntil:f.base+90000,projectionSpeedKmh:40});
 f.advance(59000);const a=f.c.drState.bus.projectedMetres;f.advance(1000);const b=f.c.drState.bus.projectedMetres;
 f.advance(1000);const c=f.c.drState.bus.projectedMetres;
 assert.ok(c>b&&b>a);assert.ok(c-b<b-a);assert.ok(c<250);
 f.advance(28000);const near=f.c.drState.bus.projectedMetres;f.advance(1000);assert.ok(f.c.drState.bus.projectedMetres-near<.1);
 f.advance(30000);assert.ok(f.c.drState.bus.projectedMetres<250);
});
test('coherent projection tapers to a safe stop at 120 seconds without renewing the fix',()=>{
 const f=fixture();f.update({projectionUntil:f.base+120000});f.advance(90000);const at90=f.c.drState.bus.projectedMetres;
 f.advance(10000);assert.ok(f.c.drState.bus.projectedMetres>at90);f.advance(20000);const end=f.marker.pos.lng;
 f.advance(10000);assert.equal(f.marker.pos.lng,end);assert.equal(f.c.drState.bus.gpsTimestamp,f.base);
});

test('validated route bearing wins over noisy snapshots and small angular jitter requires progress',()=>{
 const f=fixture();f.update();let tangent=359;f.c.headingNaRota=()=>tangent;
 f.c.updateRoadHeading('bus',f.marker,45);assert.equal(f.c.vehicleHeadings.bus,359);
 for(const angle of [14,359,12,359]){tangent=angle;f.c.updateRoadHeading('bus',f.marker,angle);assert.equal(f.c.vehicleHeadings.bus,359);}
 tangent=1;f.c.drState.bus.posicaoNaRota+=20/111000;f.c.updateRoadHeading('bus',f.marker,180);assert.equal(f.c.vehicleHeadings.bus,1);
 tangent=90;f.c.drState.bus.posicaoNaRota+=5/111000;f.c.updateRoadHeading('bus',f.marker,0);assert.equal(f.c.vehicleHeadings.bus,90);
 f.c.drState.bus.velocidade=0;tangent=180;f.c.updateRoadHeading('bus',f.marker,180);assert.equal(f.c.vehicleHeadings.bus,90);
});

test('loss of projection eligibility cannot animate a physical fix backwards along the same route',()=>{
 const f=fixture();f.update();f.advance(10000);const shown=f.marker.pos.lng;
 f.update({backendMotionEligible:false,longitude:.00005},undefined,f.base+10000,.00005);
 assert.equal(f.c.animFrames.bus,undefined);assert.equal(f.marker.pos.lng,shown);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);
 f.advance(31000);assert.equal(f.marker.pos.lng,.00005);assert.equal(f.c.drState.bus.visualAhead,false);
 f.update({longitude:.00005},undefined,f.base+10000,.00005);assert.equal(f.c.drState.bus.backendMotionEligible,false);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);
});

test('legacy road projection also bounds trailing GPS debt and waits for new physical evidence',()=>{
 const f=fixture();f.update({backendUnified:false,velocidadeMedia:6});f.advance(10000);
 const shown=f.marker.pos.lng;f.update({backendUnified:false,velocidadeMedia:6,longitude:.00005},undefined,f.base+10000,.00005);
 assert.equal(f.marker.pos.lng,shown);assert.equal(f.c.animFrames.bus,undefined);
 f.advance(31000);assert.equal(f.marker.pos.lng,.00005);f.advance(10000);assert.equal(f.marker.pos.lng,.00005);
 f.update({backendUnified:false,velocidadeMedia:6,longitude:.0002},undefined,f.base+51000,.0002);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+51000);assert.ok(f.c.animFrames.bus);
});

test('physical progress catches visual debt before timeout and repeated snapshots cannot restart it',()=>{
 const f=fixture();f.update();f.advance(10000);const shown=f.c.drState.bus.posicaoNaRota;
 f.update({longitude:.00005},undefined,f.base+10000,.00005);const deadline=f.c.drState.bus.visualHoldAt,used=f.c.drState.bus.projectedMetres;
 f.update({longitude:.00005},undefined,f.base+10000,.00005);assert.equal(f.c.drState.bus.visualHoldAt,deadline);assert.equal(f.c.drState.bus.projectedMetres,used);
 f.update({longitude:shown+.0001},undefined,f.base+11000,shown+.0001);assert.equal(f.c.drState.bus.visualAhead,false);assert.equal(f.c.drState.bus.projectedMetres,0);assert.ok(f.c.animFrames.bus);
});

test('legacy zero cannot keep projecting an old average but distinct route progress can estimate movement',()=>{
 const f=fixture();f.update({backendUnified:false,velocidade:0,velocidadeMedia:40});f.advance(10000);assert.equal(f.marker.pos.lng,0);assert.equal(f.c.drState.bus.velocidade,0);
 f.update({backendUnified:false,velocidade:0,velocidadeMedia:40,longitude:.0002},undefined,f.base+10000,.0002);
 assert.ok(f.c.drState.bus.velocidade>0&&f.c.drState.bus.velocidade<10);
 f.update({backendUnified:false,velocidade:0,velocidadeMedia:40,longitude:.0002},undefined,f.base+20000,.0002);assert.equal(f.c.drState.bus.velocidade,0);
});

test('confirmed legacy terminal stop cannot retain an extrapolated position indefinitely',()=>{
 const f=fixture();f.update({backendUnified:false,velocidadeMedia:6});f.advance(10000);const shown=f.marker.pos.lng;
 f.update({backendUnified:false,velocidade:0,velocidadeMedia:35,presencaEstado:'fim_percurso'},undefined,f.base+10000,0);
 assert.equal(f.marker.pos.lng,shown);assert.equal(f.c.drState.bus.visualAhead,true);assert.equal(f.c.drState.bus.velocidade,0);
 f.advance(31000);assert.equal(f.marker.pos.lng,0);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);
});
