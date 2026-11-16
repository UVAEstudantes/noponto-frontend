/* global __dirname */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture(){
 const source=fs.readFileSync(path.join(__dirname,'../components/mapOSM/webview/mapScript.ts'),'utf8');
 const extract=name=>{const m=source.match(new RegExp('function '+name+'\\([^]*?\\n}'));assert.ok(m,name);return m[0];};
 const base=Date.parse('2026-11-15T12:00:00Z');let now=base,tick;const frames=new Map();let frameId=0;
 const c={Date:{now:()=>now},performance:{now:()=>now},drState:{},vehicleMarkers:{},vehiclePopups:{},vehicleHeadings:{},animFrames:{},window:{},motionTraceOrders:[],gpsPolicy:{baseProjectionMs:60000,maxProjectionMetres:250,delayedMs:180000,publicMs:480000},roadMovement:{accepted:0,repeated:0,routeSyncs:0,linearSyncs:0,positionWrites:0},drInterval:null,movementDiagnostics:false,roadMotionHorizonMs:60000,parseNum:x=>x==null?null:Number(x),distanceMeters:(a,b)=>Math.hypot(a.lat-b.lat,a.lng-b.lng)*111000,interpolarNaRota:(coords,p)=>[0,p],headingNaRota:()=>90,setHeading:()=>{},reportRoadMovement:()=>{},updateRoadFreshness:()=>{},setInterval:f=>{tick=f;return 1;},gpsMarkerOpacity:()=>1,requestAnimationFrame:f=>{frames.set(++frameId,ts=>{now=Math.max(now,ts);f(ts);});return frameId;},cancelAnimationFrame:id=>frames.delete(id)};
 vm.createContext(c);vm.runInContext(['roadIdentityChanged','roadVisualProgress','roadProjectionMetres','updateRoadHeading','updateRoadMotion','comprimentoRotaGraus','kmhParaGrausPorSeg','startDR','stopAnim','animateTo'].map(extract).join('\n'),c);
 const marker={element:{style:{}},pos:{lng:0,lat:0},setLngLat(p){this.pos={lng:p[0],lat:p[1]};},getLngLat(){return this.pos;},getElement(){return this.element;},remove(){}};
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
 const f=fixture();f.update();f.update({longitude:.0001},undefined,f.base+1000,.0001);assert.ok(f.c.animFrames.bus);
 f.update({longitude:.0001,backendMotionEligible:false},undefined,f.base+1000,.0001);assert.equal(f.c.animFrames.bus,undefined);assert.equal(f.frames.size,0);
 f.update({longitude:.0001,backendMotionEligible:true},undefined,f.base,0);assert.equal(f.c.drState.bus.backendMotionEligible,false);
 f.update({longitude:.5},undefined,f.base+1000,.5);assert.equal(f.c.drState.bus.backendMotionEligible,false);assert.equal(f.c.drState.bus.gpsCoordinate.lng,.0001);
});
test('ambiguous context cannot start motion and fresh GPS still advances normally',()=>{
 const f=fixture();f.update({backendMotionEligible:false},null,f.base,null);f.update({backendMotionEligible:false},[[0,0],[0,1]],f.base,0);f.advance(10000);assert.equal(f.marker.pos.lng,0);
 f.update({longitude:.0001},undefined,f.base+10000,.0001);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);assert.ok(f.c.animFrames.bus);
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


test('new physical fix behind projection slows continuously without a backwards RAF',()=>{
 const f=fixture();f.update();f.advance(10000);const visual=f.marker.pos.lng;
 f.update({longitude:.00005},undefined,f.base+10000,.00005);assert.equal(f.c.drState.bus.gpsCoordinate.lng,.00005);assert.equal(f.c.animFrames.bus,undefined);
 f.advance(10000);assert.ok(f.marker.pos.lng>visual);const next=f.marker.pos.lng;
 f.update({longitude:.0001},undefined,f.base+20000,.0001);assert.equal(f.marker.pos.lng,next);f.advance(10000);assert.ok(f.marker.pos.lng>=next);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+20000);
});
test('a large presentation gap alone cannot reanchor while a changed directed route remains legitimate',()=>{
 const f=fixture();f.update({},undefined,f.base,.01);const shown=f.marker.pos.lng;f.update({longitude:0},undefined,f.base+1000,0);
 assert.equal(f.marker.pos.lng,shown);f.advance(700);assert.ok(f.marker.pos.lng>=shown);assert.notEqual(f.marker.getElement().style.opacity,'0');assert.equal(f.c.animFrames.bus,undefined);
 f.update({longitude:.002},undefined,f.base+2000,.002,'line|return|pattern2|version');assert.equal(f.c.drState.bus.identity,'line|return|pattern2|version');assert.equal(f.c.drState.bus.visualAhead,false);
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
 f.advance(31000);assert.equal(f.marker.pos.lng,shown);assert.equal(f.c.drState.bus.visualAhead,true);
 f.update({longitude:.00005},undefined,f.base+10000,.00005);assert.equal(f.c.drState.bus.backendMotionEligible,true);assert.equal(f.marker.pos.lng,shown);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);
});

test('legacy road projection reconciles trailing GPS continuously without renewing the physical timestamp',()=>{
 const f=fixture();f.update({backendUnified:false,velocidadeMedia:6});f.advance(10000);const shown=f.marker.pos.lng;
 f.update({backendUnified:false,velocidadeMedia:6,longitude:.00005},undefined,f.base+10000,.00005);assert.equal(f.marker.pos.lng,shown);f.advance(10000);assert.ok(f.marker.pos.lng>shown);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);assert.ok(f.c.drState.bus.projectedMetres<=250);
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

test('confirmed legacy terminal stop stops without returning to the historical anchor',()=>{
 const f=fixture();f.update({backendUnified:false,velocidadeMedia:6});f.advance(10000);const shown=f.marker.pos.lng;
 f.update({backendUnified:false,velocidade:0,velocidadeMedia:35,presencaEstado:'fim_percurso'},undefined,f.base+10000,0);
 assert.equal(f.marker.pos.lng,shown);assert.equal(f.c.drState.bus.visualAhead,true);assert.equal(f.c.drState.bus.velocidade,0);
 f.advance(61000);assert.equal(f.marker.pos.lng,shown);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);assert.equal(f.c.drState.bus.visualUncertain,true);
});

for(const speed of [30,40])test(`delayed ${speed} kmh fix retains temporal speed through 55 seconds`,()=>{
 const f=fixture();f.advance(25000);f.update({projectionUntil:f.base+90000,projectionSpeedKmh:speed,projectionMaxMetres:1000});
 f.advance(15000);const a=f.c.drState.bus.projectedMetres;f.advance(1000);const b=f.c.drState.bus.projectedMetres;
 assert.ok((b-a)*3.6>speed*.9,'no temporal penalty at age 40');
 f.advance(14000);const before=f.c.drState.bus.projectedMetres;f.advance(1000);
 assert.ok((f.c.drState.bus.projectedMetres-before)*3.6>speed*.85,'no early compounded slowdown');
});

for(const speed of [30,40])test(`coherent delayed ${speed} kmh projection compensates physical age within its bounded ledger`,()=>{
 const f=fixture();f.advance(25000);const cap=Math.min(600,speed/3.6*60);
 f.update({projectionUntil:f.base+120000,projectionSpeedKmh:speed,projectionMaxMetres:cap,contextConfidence:'retained'});
 const initial=f.c.drState.bus.projectedMetres;assert.ok(Math.abs(initial-speed/3.6*25)<1,'initial age is physical, not receipt time');
 f.advance(15000);const a=f.c.drState.bus.projectedMetres;f.advance(1000);assert.ok((f.c.drState.bus.projectedMetres-a)*3.6>speed*.9);
 f.advance(14000);const b=f.c.drState.bus.projectedMetres;f.advance(1000);assert.ok((f.c.drState.bus.projectedMetres-b)*3.6>Math.max(8,speed*.2));
 f.advance(9000);const old=f.c.drState.bus.projectedMetres;assert.ok(old<cap);
 let previous=0;for(let age=25100;age<=65000;age+=100){const temporal=Math.min(1,Math.max(0,90000-age)/60000)**2;previous+=Math.min(250-previous,speed/3.6*.1*temporal*Math.min(1,(250-previous)/100));}
 assert.ok(Math.abs(old-speed/3.6*65)<Math.abs(previous-speed/3.6*65),'less presentation lag than stage 2A');
 const gps=speed/3.6*40/111000;
 f.update({projectionUntil:f.base+160000,projectionSpeedKmh:speed,projectionMaxMetres:cap,contextConfidence:'retained',longitude:gps},undefined,f.base+40000,gps);
 assert.equal(f.c.drState.bus.gpsTimestamp,f.base+40000);assert.ok(f.c.drState.bus.projectedMetres<=cap);assert.ok(f.c.animFrames.bus,'bounded forward reconciliation uses a short transition');
 assert.ok(Math.abs(f.c.drState.bus.posicaoNaRota*111000-speed/3.6*65)<speed/3.6*12,'normal reconciliation remains close to current progress');
 const used=f.c.drState.bus.projectedMetres;f.update({projectionUntil:f.base+160000,projectionSpeedKmh:speed,projectionMaxMetres:cap,contextConfidence:'retained',longitude:gps},undefined,f.base+40000,gps);assert.equal(f.c.drState.bus.projectedMetres,used);
 f.advance(130000);assert.ok(f.c.drState.bus.projectedMetres<=cap);
});

test('unrouted heading preserves trusted orientation and uses distinct plausible physical displacement',()=>{
 const f=fixture();f.update();f.c.updateRoadHeading('bus',f.marker,180);assert.equal(f.c.vehicleHeadings.bus,90);
 f.advance(10000);f.update({backendMotionEligible:false,longitude:.0002},null,f.base+10000,null,'line|||');
 f.c.updateRoadHeading('bus',f.marker,15);assert.ok(Math.abs(f.c.vehicleHeadings.bus-90)<1);assert.equal(f.c.drState.bus.headingKind,'physical');
 f.c.updateRoadHeading('bus',f.marker,160);assert.equal(f.c.drState.bus.headingKind,'preserved');assert.ok(Math.abs(f.c.vehicleHeadings.bus-90)<1);
 f.advance(10000);f.update({backendMotionEligible:false,longitude:.0002},null,f.base+20000,null,'line|||');f.c.updateRoadHeading('bus',f.marker,220);
 assert.ok(Math.abs(f.c.vehicleHeadings.bus-90)<1);assert.equal(f.c.drState.bus.headingKind,'preserved');
 f.update({backendMotionEligible:false,longitude:.0002},null,f.base+21000,null,'line|reverse||');f.c.updateRoadHeading('bus',f.marker,45);
 assert.equal(f.c.drState.bus.headingKind,'unavailable');assert.equal(f.c.vehicleHeadings.bus,undefined);
});
test('unknown stationary vehicle cannot adopt a random single-fix bearing',()=>{
 const f=fixture();f.update({backendMotionEligible:false},null,f.base,null,'line|||');f.c.updateRoadHeading('bus',f.marker,123);
 assert.equal(f.c.vehicleHeadings.bus,undefined);assert.equal(f.c.drState.bus.headingKind,'unavailable');
});

test('same physical fix with a confirmed direction conflict invalidates preserved heading',()=>{
 const f=fixture();f.update();f.c.updateRoadHeading('bus',f.marker,90);
 f.update({backendMotionEligible:false},null,f.base,null,'line|reverse||');f.c.updateRoadHeading('bus',f.marker,270);
 assert.equal(f.c.drState.bus.gpsTimestamp,f.base);assert.equal(f.c.drState.bus.headingKind,'unavailable');assert.equal(f.c.vehicleHeadings.bus,undefined);
});

test('new physical displacement can establish heading after a confirmed direction change',()=>{
 const f=fixture();f.update();f.c.updateRoadHeading('bus',f.marker,90);f.advance(10000);
 f.update({backendMotionEligible:false,longitude:.0002},null,f.base+10000,null,'line|reverse||');f.c.updateRoadHeading('bus',f.marker,0);assert.equal(f.c.drState.bus.headingKind,'unavailable');
 f.advance(10000);f.update({backendMotionEligible:false,longitude:0},null,f.base+20000,null,'line|reverse||');f.c.updateRoadHeading('bus',f.marker,0);
 assert.equal(f.c.drState.bus.headingKind,'physical');assert.equal(f.c.vehicleHeadings.bus,270);
});


test('delayed new anchor compares current presentation before deciding a backward hold',()=>{
 const f=fixture(),speed=40,metres=speed/3.6;
 f.advance(30000);f.update({projectionUntil:f.base+90000,projectionSpeedKmh:speed,projectionMaxMetres:1000,contextConfidence:'retained'});
 f.advance(30000);const before=f.marker.pos.lng;
 const physical=metres*30/111000;
 f.update({longitude:physical,projectionUntil:f.base+120000,projectionSpeedKmh:30,projectionMaxMetres:750,contextConfidence:'retained'},undefined,f.base+30000,physical);
 assert.equal(f.c.drState.bus.gpsCoordinate.lng,physical);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+30000);
 assert.equal(f.marker.pos.lng,before,'same-time discrepancy under 100 m holds instead of snapping backwards');
 assert.equal(f.c.drState.bus.visualAhead,true);assert.equal(f.c.animFrames.bus,undefined);
 f.advance(25000);assert.equal(f.c.drState.bus.visualAhead,false,'new anchor catches visual debt without requiring another GPS');
 const caught=f.marker.pos.lng;f.advance(1000);assert.ok((f.marker.pos.lng-caught)*111000*3.6>25,'normal speed resumes');
});


for(const age of [25000,35000])test(`delayed ${age/1000}s fix behind historical anchor reconciles forward at the current instant`,()=>{
 const f=fixture();f.advance(30000);f.update({projectionUntil:f.base+120000,projectionSpeedKmh:40,projectionMaxMetres:1000,contextConfidence:'retained'});
 f.advance(30000);const shown=f.marker.pos.lng,at=f.base+60000-age;
 const physical=shown-250/111000;
 f.update({longitude:physical,projectionUntil:at+90000,projectionSpeedKmh:40,projectionMaxMetres:1000,contextConfidence:'retained'},undefined,at,physical);
 assert.ok(f.c.drState.bus.posicaoNaRota>shown);assert.equal(f.c.drState.bus.visualAhead,false);assert.ok(f.c.animFrames.bus);
 assert.equal(f.marker.pos.lng,shown);const frame=[...f.frames.values()].at(-1);frame(f.base+60700);
 assert.ok(f.marker.pos.lng>shown);assert.equal(f.c.drState.bus.gpsPosition,physical);
 assert.ok(Math.abs(f.c.drState.bus.projectedMetres-40/3.6*age/1000)<.1);
});

test('new delayed fixes and repeated metadata cannot extend the bounded dynamic reconciliation deadline',()=>{
 const f=fixture();f.advance(30000);f.update({projectionUntil:f.base+90000,projectionSpeedKmh:40,projectionMaxMetres:1000,contextConfidence:'retained'});f.advance(30000);
 const shown=f.marker.pos.lng,physical=shown-300/111000;
 const data={longitude:physical,projectionUntil:f.base+120000,projectionSpeedKmh:30,projectionMaxMetres:750,contextConfidence:'retained'};
 f.update(data,undefined,f.base+30000,physical);const start=f.c.drState.bus.visualHoldAt;
 assert.equal(start,f.base+60000);f.advance(1000);f.update(data,undefined,f.base+30000,physical);assert.equal(f.c.drState.bus.visualHoldAt,start);
 f.advance(4000);const nextPhysical=shown-140/111000;
 const next={longitude:nextPhysical,projectionUntil:f.base+125000,projectionSpeedKmh:6,projectionMaxMetres:300,contextConfidence:'retained'};
 f.update(next,undefined,f.base+35000,nextPhysical);assert.equal(f.c.drState.bus.visualHoldAt,start);assert.ok(f.marker.pos.lng>=shown);
 f.advance(f.c.drState.bus.reconcileLimitMs-(f.c.Date.now()-start)+700);assert.equal(f.c.drState.bus.visualAhead,true);assert.equal(f.c.animFrames.bus,undefined);
 assert.ok(f.marker.pos.lng>=shown,'deadline cannot authorize a reverse correction');assert.equal(f.c.drState.bus.visualUncertain,true);
 const corrected=f.marker.pos.lng;f.update(next,undefined,f.base+35000,nextPhysical);f.advance(1000);assert.ok(f.marker.pos.lng>=corrected);assert.equal(f.c.drState.bus.backendMotionEligible,true);assert.equal(f.c.drState.bus.visualHoldAt,start);
});

test('a newer fix during forward RAF compares the rendered progress instead of its unfinished target',()=>{
 const f=fixture();f.update();f.advance(10000);const shown=f.marker.pos.lng;
 f.update({longitude:shown+.00018},undefined,f.base+10000,shown+.00018);
 let frame=[...f.frames.values()].at(-1);frame(f.base+10350);const rendered=f.marker.pos.lng;
 f.update({longitude:rendered+.00001},undefined,f.base+10100,rendered+.00001);
 assert.equal(f.c.drState.bus.visualAhead,false);assert.ok(f.c.animFrames.bus);assert.equal(f.marker.pos.lng,rendered);
});

test('large same-time gaps preserve progress until confirmed identity changes allow recovery',()=>{
 const f=fixture();f.advance(30000);f.update({projectionUntil:f.base+120000,projectionSpeedKmh:40,projectionMaxMetres:1000,contextConfidence:'retained'});f.advance(30000);
 const shown=f.marker.pos.lng;
 f.update({longitude:0,projectionUntil:f.base+120000,projectionSpeedKmh:10,projectionMaxMetres:300,contextConfidence:'retained'},undefined,f.base+30000,0);
 assert.equal(f.marker.pos.lng,shown);f.advance(700);assert.ok(f.marker.pos.lng>=shown);assert.equal(f.c.drState.bus.visualUncertain,true);assert.equal(f.c.drState.bus.visualCorrectionAt,undefined);assert.equal(f.c.animFrames.bus,undefined);assert.equal(f.c.drState.bus.visualAhead,true);
 f.update({longitude:.001},[[0,0],[0,.5]],f.base+31000,.002,'new-line|reverse|new-pattern|v2');assert.equal(f.c.drState.bus.identity,'new-line|reverse|new-pattern|v2');assert.equal(f.c.drState.bus.visualAhead,false);assert.equal(f.c.animFrames.bus,undefined);
});


test('eligibility withdrawal preserves the rendered route progress when cancelling reconciliation',()=>{
 const f=fixture();f.update();f.advance(10000);const start=f.marker.pos.lng;
 f.update({longitude:start+.00018},undefined,f.base+10000,start+.00018);const frame=[...f.frames.values()].at(-1);frame(f.base+10350);const shown=f.marker.pos.lng;
 f.update({longitude:start+.00018,backendMotionEligible:false},undefined,f.base+10000,start+.00018);
 assert.equal(f.c.animFrames.bus,undefined);assert.ok(Math.abs(f.c.drState.bus.posicaoNaRota-shown)<1e-12,'cancelled RAF must not leave its undisplayed target as the visual anchor');
 f.update({longitude:shown+.00001},undefined,f.base+10100,shown+.00001);assert.equal(f.c.drState.bus.visualAhead,false);
});


test('dynamic reconciliation continues forward while paying delayed GPS debt without a stationary hold',()=>{
 const f=fixture();f.advance(30000);f.update({projectionUntil:f.base+90000,projectionSpeedKmh:40,projectionMaxMetres:1000,contextConfidence:'retained'});f.advance(30000);
 const shown=f.marker.pos.lng,physical=40/3.6*30/111000;
 f.update({longitude:physical,projectionUntil:f.base+120000,projectionSpeedKmh:30,projectionMaxMetres:750,contextConfidence:'retained'},undefined,f.base+30000,physical);
 const started=f.c.drState.bus.visualHoldAt;assert.ok(f.c.drState.bus.reconcileLimitMs<=60000);f.advance(5000);
 assert.ok(f.marker.pos.lng>shown+10/111000,'positive evidence keeps actual marker moving');assert.equal(f.c.drState.bus.gpsTimestamp,f.base+30000);
 f.update({longitude:physical,projectionUntil:f.base+120000,projectionSpeedKmh:30,projectionMaxMetres:750,contextConfidence:'retained'},undefined,f.base+30000,physical);assert.equal(f.c.drState.bus.visualHoldAt,started);
 const before=f.marker.pos.lng;f.advance(1000);const speed=(f.marker.pos.lng-before)*111000*3.6;assert.ok(speed>=16.4&&speed<30);
});


test('absolute physical age ceiling never projects past180 even if a longer snapshot deadline arrives',()=>{
 const f=fixture();f.update({projectionUntil:f.base+300000,projectionMaxMetres:1000,projectionSpeedKmh:6,contextConfidence:'retained'});
 assert.equal(f.c.drState.bus.projectionUntil,f.base+180000);
 for(const age of [30,60,90,120,180]){f.advance(age*1000-(f.c.Date.now()-f.base));assert.ok(Number.isFinite(f.marker.pos.lng));assert.ok(f.c.drState.bus.projectedMetres<=1000);}
 const stopped=f.marker.pos.lng;f.update({projectionUntil:f.base+600000,projectionMaxMetres:2000});f.advance(20000);assert.equal(f.marker.pos.lng,stopped);assert.equal(f.c.drState.bus.gpsTimestamp,f.base);assert.equal(f.c.drState.bus.projectionUntil,f.base+180000);
});


test('route recovery uses actual render time rather than an advanced RAF timestamp',()=>{
 const f=fixture();f.update();f.advance(10000);const shown=f.marker.pos.lng;let actual=f.base+10000;f.c.performance.now=()=>actual;
 f.update({longitude:shown+20/111000},undefined,f.base+10000,shown+20/111000);const frame=[...f.frames.values()].at(-1);
 actual+=100;frame(f.base+10300);const moved=(f.marker.pos.lng-shown)*111000;
 assert.ok(moved>0&&moved<=6/3.6*.1*2+.001,`actual 100ms renders ${moved}m`);assert.equal(f.c.drState.bus.gpsTimestamp,f.base+10000);
});


test('rendered anchor recovery refuses off-route ambiguous or distant points',()=>{
 const f=fixture(),project=f.c.roadVisualProgress;
 assert.equal(project([[0,0],[0,.002]],{lat:0,lng:.001},.5,222),.5);
 assert.equal(project([[0,0],[0,.002]],{lat:.001,lng:.001},.5,222),null);
 assert.equal(project([[0,0],[0,.002],[0,0]],{lat:0,lng:.001},.5,444),null);
 assert.equal(project([[0,0],[0,1]],{lat:0,lng:.005},.001,111000),null);
});

function renderedSequence(){
 const f=fixture(),writes=[];const write=f.marker.setLngLat;
 f.marker.setLngLat=function(p){writes.push({at:f.c.Date.now(),metres:p[0]*111000});write.call(this,p);};
 const render=ms=>{for(let t=0;t<ms;t+=100){f.advance(Math.min(100,ms-t));const pending=[...f.frames.entries()];f.frames.clear();for(const [,frame] of pending)frame(f.c.Date.now());}};
 const monotone=()=>{for(let i=1;i<writes.length;i++)assert.ok(writes[i].metres>=writes[i-1].metres-.001,`rendered reverse ${writes[i-1].metres} -> ${writes[i].metres} at ${writes[i].at-f.base}ms`);};
 const fix=(physical,at,over={},coords)=>f.update({projectionSpeedKmh:30,projectionMaxMetres:1000,contextConfidence:'retained',projectionUntil:at+120000,longitude:physical/111000,...over},coords,at,physical/111000);
 return {...f,writes,render,monotone,fix,metres:()=>f.marker.getLngLat().lng*111000};
}

test('rendered GPS sequence stays monotone through source changes and reconciliation timeout',()=>{
 const r=renderedSequence();r.render(25000);r.fix(0,r.base);r.render(20000);
 const sources=['ITS_CURRENT','GTFSRT_BUS','ITS_CURRENT'];
 for(let i=0;i<3;i++){
  const at=r.c.Date.now()-25000,physical=30/3.6*(at-r.base)/1000-80;
  const shown=r.metres();r.fix(physical,at,{unifiedSource:sources[i]});r.render(10000);
  assert.ok(r.metres()>shown+30,'positive evidence must keep moving after an ordinary delayed fix');r.monotone();
  const used=r.c.drState.bus.projectedMetres;r.fix(physical,at,{unifiedSource:sources[i]});assert.equal(r.c.drState.bus.projectedMetres,used);assert.equal(r.c.drState.bus.gpsTimestamp,at);
 }
 r.render(35000);r.monotone();assert.ok(r.c.drState.bus.backendMotionEligible,'timeout alone cannot disable valid motion');
});

test('rendered zero and eligibility loss never reanchor to a trailing physical coordinate',()=>{
 const r=renderedSequence();r.fix(0,r.base);r.render(10000);const shown=r.metres();
 r.fix(5,r.base+10000,{projectionSpeedKmh:3,projectionSpeedKind:'possible_stop',velocidade:0});r.render(5000);r.monotone();assert.ok(r.metres()>shown);
 for(const at of [15000,25000,35000]){r.fix(5,r.base+at,{projectionSpeedKmh:0,backendMotionEligible:false,physicalMotionState:'stopped'});r.render(10000);r.monotone();}
 const stopped=r.metres();r.render(5000);assert.equal(r.metres(),stopped);
 r.fix(stopped+10,r.c.Date.now(),{projectionSpeedKmh:30});r.render(5000);r.monotone();assert.ok(r.metres()>stopped);
});

test('rendered route continuity survives missing geometry and a GPS during forward recovery',()=>{
 const r=renderedSequence();r.fix(0,r.base);r.render(10000);const shown=r.metres();
 r.fix(shown+80,r.c.Date.now());r.render(2000);const drawn=r.metres();assert.ok(drawn>shown&&drawn<shown+80);
 r.fix(drawn-10,r.c.Date.now()-1000,{backendMotionEligible:false},null);r.render(3000);r.monotone();
 const at=r.c.Date.now();r.fix(drawn-5,at);r.render(5000);r.monotone();assert.ok(r.metres()>drawn);
 r.fix(r.metres()+10,r.c.Date.now());r.render(1000);const before=r.metres();
 r.fix(before-10,r.c.Date.now(),{backendMotionEligible:false});r.render(2000);r.monotone();
});

test('rendered delayed positive GPS cannot roll back or freeze solely at reconciliation deadline',()=>{
 const r=renderedSequence();r.render(30000);r.fix(0,r.base,{projectionSpeedKmh:40});r.render(30000);
 const shown=r.metres(),at=r.base+30000,physical=shown-140;
 r.fix(physical,at,{projectionSpeedKmh:6});r.render(65000);r.monotone();
 assert.ok(r.metres()>shown+20);assert.equal(r.c.drState.bus.gpsTimestamp,at);assert.equal(r.c.drState.bus.projectionUntil,at+120000);
});


test('sustained distinct physical route regressions permit explicit uncertain recovery',()=>{
 const r=renderedSequence();r.fix(1000,r.base);r.render(10000);
 r.fix(900,r.base+10000);r.render(1000);r.monotone();assert.notEqual(r.marker.getElement().style.opacity,'0');
 r.render(9000);r.fix(800,r.base+20000);r.render(700);
 assert.ok(r.metres()<1000,'two contradictory physical fixes over20s permit exceptional recovery');
 assert.equal(r.c.drState.bus.visualUncertain,true);assert.equal(r.c.drState.bus.visualCorrectionAt,r.base+20000);
 assert.equal(r.c.animFrames.bus,undefined);const recovered=r.metres();r.fix(800,r.base+20000);r.render(1000);assert.equal(r.metres(),recovered);
});
